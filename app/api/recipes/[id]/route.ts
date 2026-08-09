import { supabase } from "@/lib/supabase";


export async function DELETE(
    request: Request,
    {
        params
    }: {
        params: Promise<{
            id: string
        }>
    }
) {

    const { id } = await params;

    try {

        const { error } =
            await supabase
                .from("recipes")
                .delete()
                .eq("id", id);

        if (error) {
            throw error;
        }

        return Response.json({
            success: true
        });

    } catch (error: any) {

        return Response.json(
            {
                error: error.message
            },
            {
                status: 500
            }
        );

    }
}


export async function PATCH(
    request: Request,
    {
        params
    }: {
        params: Promise<{
            id: string
        }>
    }
) {

    const { id } = await params;

    try {

        const recipe =
            await request.json();

        const { data, error } =
            await supabase
                .from("recipes")
                .update({

                    title:
                        recipe.title,

                    source_url:
                        recipe.sourceUrl || null,

                    image_url:
                        recipe.imageUrl || null,

                    category:
                        recipe.category,

                    tags:
                        recipe.tags || [],

                    ingredients:
                        recipe.ingredients || [],

                    steps:
                        recipe.steps || [],

                    notes:
                        recipe.notes || null,

                    prep_time_minutes:
                        recipe.prepTimeMinutes || null,

                    cook_time_minutes:
                        recipe.cookTimeMinutes || null,

                    total_time_minutes:
                        recipe.totalTimeMinutes || null,

                    servings:
                        recipe.servings || null,

                    nutrition:
                        recipe.nutrition || null

                })
                .eq("id", id)
                .select()
                .single();

        if (error) {
            throw error;
        }

        return Response.json(data);

    } catch (error: any) {

        return Response.json(
            {
                error: error.message
            },
            {
                status: 500
            }
        );

    }
}